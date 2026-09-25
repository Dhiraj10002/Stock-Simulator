package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

func main() {
	sourceFlag := flag.String("source", "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json", "Source URL or local file path to Angel One OpenAPIScripMaster.json")
	batchSizeFlag := flag.Int("batch-size", 500, "Number of instruments to upsert per database transaction")
	segmentsFlag := flag.String("segments", "NSE,NFO,BSE", "Comma-separated exchange segments to sync")
	underlyingsFlag := flag.String("underlyings", "", "Optional comma-separated list of underlyings to filter")
	seedOnlyFlag := flag.Bool("seed-defaults", false, "Seed built-in canonical instruments without downloading remote scrip master")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}
	if err := database.Connect(cfg); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	db := database.GetDB()
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		log.Fatalf("Failed to migrate instruments schema: %v", err)
	}

	svc := service.NewService(db)

	if *seedOnlyFlag {
		log.Println("Seeding built-in canonical instruments...")
		for _, inst := range service.DefaultCanonicalInstruments {
			var existing model.Instrument
			if err := db.Where("token = ? AND exchange_segment = ?", inst.Token, inst.ExchangeSegment).First(&existing).Error; err != nil {
				if err := db.Create(&inst).Error; err != nil {
					log.Printf("Failed seeding %s: %v", inst.Symbol, err)
				}
			}
		}
		log.Println("Canonical defaults seeded successfully.")
		return
	}

	var segs []string
	if *segmentsFlag != "" {
		for _, s := range strings.Split(*segmentsFlag, ",") {
			if trimmed := strings.TrimSpace(s); trimmed != "" {
				segs = append(segs, trimmed)
			}
		}
	}

	var underlyings []string
	if *underlyingsFlag != "" {
		for _, u := range strings.Split(*underlyingsFlag, ",") {
			if trimmed := strings.TrimSpace(u); trimmed != "" {
				underlyings = append(underlyings, trimmed)
			}
		}
	}

	opts := service.SyncOptions{
		BatchSize:         *batchSizeFlag,
		TargetSegments:    segs,
		TargetUnderlyings: underlyings,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	log.Printf("Starting canonical instrument synchronization from: %s", *sourceFlag)
	stats, err := svc.SyncFromScripMaster(ctx, *sourceFlag, opts)
	if err != nil {
		log.Fatalf("Instrument sync failed: %v", err)
	}

	fmt.Printf("\n=== Canonical Instrument Master Sync Summary ===\n")
	fmt.Printf("Total Scrips Processed: %d\n", stats.TotalProcessed)
	fmt.Printf("Total Instruments Upserted: %d\n", stats.TotalUpserted)
	fmt.Printf("Total Skipped (Filtered/Inactive): %d\n", stats.TotalSkipped)
	fmt.Printf("Elapsed Duration: %v (%d ms)\n", time.Duration(stats.DurationMs)*time.Millisecond, stats.DurationMs)
	fmt.Println("================================================")
}
