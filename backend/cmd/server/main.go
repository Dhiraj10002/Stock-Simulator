package main

import (
	"log"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/app"
)

func main() {

	application := app.New()

	if err := application.Run(); err != nil {
		log.Fatal(err)
	}
}
