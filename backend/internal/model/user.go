package model
package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID        uint           `gorm:"primaryKey"`
	UUID      uuid.UUID      `gorm:"type:uuid;uniqueIndex"`
	Name      string         `gorm:"size:100;not null"`
	Email     string         `gorm:"size:255;uniqueIndex;not null"`
	Password  string         `gorm:"not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	u.UUID = uuid.New()
	return nil
}

type User struct {

	ID uint `gorm:"primaryKey"`

	UUID uuid.UUID `gorm:"type:uuid;uniqueIndex"`

	Name string `gorm:"size:100;not null"`

	Email string `gorm:"size:255;uniqueIndex;not null"`

	Password string `gorm:"not null"`

	CreatedAt time.Time

	UpdatedAt time.Time

	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {

	u.UUID = uuid.New()

	return nil
}