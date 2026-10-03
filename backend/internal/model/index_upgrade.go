package model

import (
	"fmt"

	"github.com/jackc/pgx/v5"
	"gorm.io/gorm"
)

// DropIndexInTableSchema resolves the table's actual PostgreSQL schema before
// quoting an index identifier. The pinned GORM driver emits CURRENT_SCHEMA()
// as an identifier in DropIndex, which PostgreSQL rejects.
func DropIndexInTableSchema(db *gorm.DB, tableName, indexName string) error {
	if db.Dialector.Name() != "postgres" {
		return db.Migrator().DropIndex(tableName, indexName)
	}
	var schema string
	if err := db.Raw(`SELECT ns.nspname FROM pg_class tbl
		JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
		WHERE tbl.oid = to_regclass(?)`, tableName).Scan(&schema).Error; err != nil {
		return err
	}
	if schema == "" {
		return fmt.Errorf("cannot resolve schema for table %s", tableName)
	}
	return db.Exec("DROP INDEX IF EXISTS " + pgx.Identifier{schema, indexName}.Sanitize()).Error
}
