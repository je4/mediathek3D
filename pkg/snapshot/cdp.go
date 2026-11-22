package snapshot

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// CDPClient manages a headless browser instance and its Chrome DevTools Protocol session.
type CDPClient struct {
	cmd       *exec.Cmd
	userData  string
	port      int
	wsConn    net.Conn
	wsReader  *bufio.Reader
	wsMu      sync.Mutex
	msgID     int64
	respChans map[int64]chan []byte
	respMu    sync.Mutex
	ctx       context.Context
	cancel    context.CancelFunc
}

// LaunchBrowser starts Chrome or Edge in headless mode with WebGL enabled and connects via CDP.
func LaunchBrowser(ctx context.Context, browserPath string, width, height int) (*CDPClient, error) {
	tempDir, err := os.MkdirTemp("", "mediathek-snapshot-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temporary browser profile directory: %w", err)
	}

	args := []string{
		"--headless=new",
		"--remote-debugging-port=0",
		fmt.Sprintf("--user-data-dir=%s", tempDir),
		fmt.Sprintf("--window-size=%d,%d", width, height),
		"--enable-webgl",
		"--disable-gpu=false",
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--disable-extensions",
		"--disable-background-networking",
		"--disable-sync",
		"--hide-scrollbars",
		"--mute-audio",
		"about:blank",
	}

	cmdCtx, cancel := context.WithCancel(ctx)
	cmd := exec.CommandContext(cmdCtx, browserPath, args...)

	if err := cmd.Start(); err != nil {
		cancel()
		_ = os.RemoveAll(tempDir)
		return nil, fmt.Errorf("failed to start browser %q: %w", browserPath, err)
	}

	// Wait for DevToolsActivePort file to be written by Chromium
	portFile := filepath.Join(tempDir, "DevToolsActivePort")
	var port int
	deadline := time.Now().Add(12 * time.Second)

	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(portFile); err == nil {
			lines := strings.Split(string(data), "\n")
			if len(lines) >= 1 {
				p, err := strconv.Atoi(strings.TrimSpace(lines[0]))
				if err == nil && p > 0 {
					port = p
					break
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}

	if port == 0 {
		cancel()
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(tempDir)
		return nil, fmt.Errorf("timeout waiting for browser remote debugging port")
	}

	// Query /json/list for the initial blank page WebSocket URL
	var wsURL string
	queryDeadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(queryDeadline) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/json/list", port))
		if err == nil && resp.StatusCode == http.StatusOK {
			var targets []struct {
				Type                 string `json:"type"`
				WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&targets); err == nil {
				_ = resp.Body.Close()
				for _, t := range targets {
					if t.Type == "page" && t.WebSocketDebuggerURL != "" {
						wsURL = t.WebSocketDebuggerURL
						break
					}
				}
				if wsURL != "" {
					break
				}
			} else {
				_ = resp.Body.Close()
			}
		}
		time.Sleep(100 * time.Millisecond)
	}

	if wsURL == "" {
		cancel()
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(tempDir)
		return nil, fmt.Errorf("failed to retrieve target page WebSocket URL from browser")
	}

	// Connect to WebSocket
	conn, reader, err := dialWebSocket(wsURL)
	if err != nil {
		cancel()
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(tempDir)
		return nil, fmt.Errorf("failed to connect to browser WebSocket %s: %w", wsURL, err)
	}

	client := &CDPClient{
		cmd:       cmd,
		userData:  tempDir,
		port:      port,
		wsConn:    conn,
		wsReader:  reader,
		respChans: make(map[int64]chan []byte),
		ctx:       cmdCtx,
		cancel:    cancel,
	}

	go client.readLoop()

	return client, nil
}

// Close terminates the browser process and cleans up temporary profile directories.
func (c *CDPClient) Close() error {
	c.cancel()

	c.wsMu.Lock()
	if c.wsConn != nil {
		_ = c.wsConn.Close()
	}
	c.wsMu.Unlock()

	if c.cmd != nil && c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
		_ = c.cmd.Wait()
	}

	if c.userData != "" {
		// Retry directory removal in case of file locks
		for i := 0; i < 5; i++ {
			if err := os.RemoveAll(c.userData); err == nil {
				break
			}
			time.Sleep(150 * time.Millisecond)
		}
	}

	return nil
}

// Call executes a CDP command and waits for its JSON response.
func (c *CDPClient) Call(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
	id := atomic.AddInt64(&c.msgID, 1)

	req := map[string]interface{}{
		"id":     id,
		"method": method,
	}
	if params != nil {
		req["params"] = params
	}

	data, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	respChan := make(chan []byte, 1)
	c.respMu.Lock()
	c.respChans[id] = respChan
	c.respMu.Unlock()

	defer func() {
		c.respMu.Lock()
		delete(c.respChans, id)
		c.respMu.Unlock()
	}()

	if err := c.sendTextFrame(data); err != nil {
		return nil, fmt.Errorf("failed to send CDP frame: %w", err)
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-c.ctx.Done():
		return nil, errors.New("CDP client closed")
	case respBytes := <-respChan:
		var resp struct {
			ID     int64           `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(respBytes, &resp); err != nil {
			return nil, fmt.Errorf("failed to parse CDP response: %w", err)
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("CDP error (%d): %s", resp.Error.Code, resp.Error.Message)
		}
		return resp.Result, nil
	}
}

// Navigate tells the page to navigate to a target URL and waits for Page.loadEventFired.
func (c *CDPClient) Navigate(ctx context.Context, targetURL string) error {
	_, err := c.Call(ctx, "Page.enable", nil)
	if err != nil {
		return err
	}

	_, err = c.Call(ctx, "Page.navigate", map[string]interface{}{
		"url": targetURL,
	})
	return err
}

// Evaluate evaluates a JavaScript expression inside the browser and decodes the return value.
func (c *CDPClient) Evaluate(ctx context.Context, expression string, resultDst interface{}) error {
	res, err := c.Call(ctx, "Runtime.evaluate", map[string]interface{}{
		"expression":    expression,
		"awaitPromise":  true,
		"returnByValue": true,
	})
	if err != nil {
		return err
	}

	var evalResult struct {
		Result struct {
			Type  string          `json:"type"`
			Value json.RawMessage `json:"value"`
		} `json:"result"`
		ExceptionDetails *struct {
			Text string `json:"text"`
		} `json:"exceptionDetails"`
	}

	if err := json.Unmarshal(res, &evalResult); err != nil {
		return fmt.Errorf("failed to unmarshal evaluate result: %w", err)
	}

	if evalResult.ExceptionDetails != nil {
		return fmt.Errorf("javascript exception: %s", evalResult.ExceptionDetails.Text)
	}

	if resultDst != nil && len(evalResult.Result.Value) > 0 {
		if err := json.Unmarshal(evalResult.Result.Value, resultDst); err != nil {
			return fmt.Errorf("failed to unmarshal javascript return value: %w", err)
		}
	}

	return nil
}

// readLoop listens for incoming WebSocket frames and dispatches responses by ID.
func (c *CDPClient) readLoop() {
	for {
		msg, err := c.readTextFrame()
		if err != nil {
			return
		}

		var header struct {
			ID int64 `json:"id"`
		}
		if err := json.Unmarshal(msg, &header); err == nil && header.ID > 0 {
			c.respMu.Lock()
			ch, ok := c.respChans[header.ID]
			c.respMu.Unlock()
			if ok {
				select {
				case ch <- msg:
				default:
				}
			}
		}
	}
}

// RFC 6455 Minimal WebSocket Implementation

func dialWebSocket(targetURL string) (net.Conn, *bufio.Reader, error) {
	u, err := url.Parse(targetURL)
	if err != nil {
		return nil, nil, err
	}

	host := u.Host
	if !strings.Contains(host, ":") {
		host += ":80"
	}

	conn, err := net.DialTimeout("tcp", host, 5*time.Second)
	if err != nil {
		return nil, nil, err
	}

	nonce := make([]byte, 16)
	_, _ = rand.Read(nonce)
	secKey := base64.StdEncoding.EncodeToString(nonce)

	req := fmt.Sprintf("GET %s HTTP/1.1\r\n"+
		"Host: %s\r\n"+
		"Upgrade: websocket\r\n"+
		"Connection: Upgrade\r\n"+
		"Sec-WebSocket-Key: %s\r\n"+
		"Sec-WebSocket-Version: 13\r\n\r\n", u.RequestURI(), u.Host, secKey)

	if _, err := conn.Write([]byte(req)); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}

	reader := bufio.NewReader(conn)
	resp, err := http.ReadResponse(reader, &http.Request{Method: "GET"})
	if err != nil {
		_ = conn.Close()
		return nil, nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		_ = conn.Close()
		return nil, nil, fmt.Errorf("unexpected WebSocket handshake status: %d", resp.StatusCode)
	}

	return conn, reader, nil
}

func (c *CDPClient) sendTextFrame(payload []byte) error {
	c.wsMu.Lock()
	defer c.wsMu.Unlock()

	var header []byte
	length := len(payload)

	// Opcode 0x1 (Text), FIN = 1 -> 0x81
	header = append(header, 0x81)

	// Client-to-server frames MUST be masked (0x80)
	if length <= 125 {
		header = append(header, byte(length)|0x80)
	} else if length <= 65535 {
		header = append(header, 126|0x80)
		buf := make([]byte, 2)
		binary.BigEndian.PutUint16(buf, uint16(length))
		header = append(header, buf...)
	} else {
		header = append(header, 127|0x80)
		buf := make([]byte, 8)
		binary.BigEndian.PutUint64(buf, uint64(length))
		header = append(header, buf...)
	}

	maskKey := make([]byte, 4)
	_, _ = rand.Read(maskKey)
	header = append(header, maskKey...)

	maskedPayload := make([]byte, length)
	for i := 0; i < length; i++ {
		maskedPayload[i] = payload[i] ^ maskKey[i%4]
	}

	if _, err := c.wsConn.Write(append(header, maskedPayload...)); err != nil {
		return err
	}
	return nil
}

func (c *CDPClient) readTextFrame() ([]byte, error) {
	for {
		b0, err := c.wsReader.ReadByte()
		if err != nil {
			return nil, err
		}

		b1, err := c.wsReader.ReadByte()
		if err != nil {
			return nil, err
		}

		opcode := b0 & 0x0F
		isMasked := (b1 & 0x80) != 0
		payloadLen := int(b1 & 0x7F)

		if payloadLen == 126 {
			buf := make([]byte, 2)
			if _, err := io.ReadFull(c.wsReader, buf); err != nil {
				return nil, err
			}
			payloadLen = int(binary.BigEndian.Uint16(buf))
		} else if payloadLen == 127 {
			buf := make([]byte, 8)
			if _, err := io.ReadFull(c.wsReader, buf); err != nil {
				return nil, err
			}
			payloadLen = int(binary.BigEndian.Uint64(buf))
		}

		var maskKey []byte
		if isMasked {
			maskKey = make([]byte, 4)
			if _, err := io.ReadFull(c.wsReader, maskKey); err != nil {
				return nil, err
			}
		}

		payload := make([]byte, payloadLen)
		if _, err := io.ReadFull(c.wsReader, payload); err != nil {
			return nil, err
		}

		if isMasked {
			for i := 0; i < payloadLen; i++ {
				payload[i] ^= maskKey[i%4]
			}
		}

		if opcode == 0x1 { // Text frame
			return payload, nil
		} else if opcode == 0x8 { // Close frame
			return nil, io.EOF
		} else if opcode == 0x9 { // Ping
			// Respond with pong
			pong := []byte{0x8A, 0x80, 0, 0, 0, 0}
			c.wsMu.Lock()
			_, _ = c.wsConn.Write(pong)
			c.wsMu.Unlock()
		}
	}
}
