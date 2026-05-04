curl -X POST http://localhost:5001/api/log-process-step-as-pharmacy \
  -H "Content-Type: application/json" \
  -d '{"id":1,"step":"Delivered","data":"{\"location\":\"Retail Pharmacy\",\"condition\":\"Sealed\"}"}'

