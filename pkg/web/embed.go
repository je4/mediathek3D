package web

import "embed"

// StaticFS embeds all static web assets (JavaScript, CSS, images, and data files).
//
//go:embed static/*
var StaticFS embed.FS

// TemplateFS embeds all Go HTML templates.
//
//go:embed template/*
var TemplateFS embed.FS
