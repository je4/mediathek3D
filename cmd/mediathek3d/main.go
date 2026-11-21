package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"mediathek3d/pkg/config"
	"mediathek3d/pkg/service"
	"mediathek3d/pkg/web"
)

func main() {
	cfg, err := config.ParseFlags(os.Args[1:])
	if err != nil {
		log.Fatalf("[FATAL] Error parsing configuration flags: %v", err)
	}

	// Load shelf and box geometry data
	var jsonData []byte
	if cfg.DataPath != "" {
		log.Printf("[INFO] Loading custom shelf data from file: %s", cfg.DataPath)
		data, err := os.ReadFile(cfg.DataPath)
		if err != nil {
			log.Fatalf("[FATAL] Failed to read shelf data from %s: %v", cfg.DataPath, err)
		}
		jsonData = data
	} else {
		log.Printf("[INFO] Loading embedded shelf data (static/data/kistendata.json)")
		data, err := web.StaticFS.ReadFile("static/data/kistendata.json")
		if err != nil {
			log.Fatalf("[FATAL] Failed to read embedded shelf data: %v", err)
		}
		jsonData = data
	}

	// Initialize domain service
	kistenSvc, err := service.NewKistenService(jsonData)
	if err != nil {
		log.Fatalf("[FATAL] Failed to parse shelf data: %v", err)
	}

	summary := kistenSvc.GetSummary()
	log.Printf("[INFO] Loaded %d shelving units with %d total box locations", summary.TotalShelves, summary.TotalBoxes)

	// Initialize Web Server
	srv, err := web.NewServer(cfg, kistenSvc)
	if err != nil {
		log.Fatalf("[FATAL] Failed to initialize web server: %v", err)
	}

	// Setup graceful shutdown channel
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	// Run HTTP server in background goroutine
	go func() {
		fmt.Println("================================================================")
		fmt.Printf("  %s\n", cfg.Title)
		fmt.Printf("  Running on: http://localhost:%d\n", cfg.Port)
		fmt.Printf("  Embed URL:  http://localhost:%d/embed\n", cfg.Port)
		fmt.Printf("  API URL:    http://localhost:%d/api/boxes\n", cfg.Port)
		fmt.Println("================================================================")

		if err := srv.ListenAndServe(); err != nil {
			log.Printf("[INFO] Server stopped: %v", err)
		}
	}()

	// Wait for termination signal
	sig := <-stopChan
	log.Printf("[INFO] Received signal %v, initiating graceful shutdown...", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[ERROR] Server shutdown error: %v", err)
	} else {
		log.Printf("[INFO] Server gracefully terminated.")
	}
}
