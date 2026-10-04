package service

import "testing"

func TestDepthPreservesPartialBookUnknownAndZeroOrders(t *testing.T) {
	values := map[string]string{"depth_json": `{"bids":[{"price_paise":10000,"quantity":20},{"price_paise":10100,"quantity":10,"orders":0}],"asks":[{"price_paise":10200,"quantity":5,"orders":2}]}`}
	book := optionalDepth(values)
	if book == nil || len(book.Bids) != 2 || len(book.Asks) != 1 || book.Bids[0].PricePaise != 10100 || book.Bids[0].Orders == nil || *book.Bids[0].Orders != 0 || book.Bids[1].Orders != nil {
		t.Fatalf("partial depth lost: %+v", book)
	}
	for _, raw := range []string{`{}`, `{"bids":[{"price_paise":100,"quantity":0}]}`, `{"bids":[{"price_paise":200,"quantity":1}],"asks":[{"price_paise":100,"quantity":1}]}`, `{"bids":[{"price_paise":100,"quantity":1,"orders":-1}]}`} {
		if optionalDepth(map[string]string{"depth_json": raw}) != nil {
			t.Fatalf("invalid book accepted: %s", raw)
		}
	}
	if optionalCount(map[string]string{"count": ""}, "count") != nil || optionalCount(map[string]string{"count": "bad"}, "count") != nil || optionalCount(map[string]string{"count": "-1"}, "count") != nil || *optionalCount(map[string]string{"count": "0"}, "count") != 0 {
		t.Fatal("unknown counts became zero")
	}
}
