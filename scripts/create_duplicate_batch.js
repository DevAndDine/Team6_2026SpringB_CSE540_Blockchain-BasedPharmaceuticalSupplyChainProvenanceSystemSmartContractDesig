curl -X POST http://localhost:5001/api/create-batch \
  -H "Content-Type: application/json" \
  -d '{"id":1,"metadata":{"drugName":"Duplicate"}}'

