curl -X POST http://localhost:5001/api/create-batch \
-H "Content-Type: application/json" \
-d '{
"id":1,
"metadata":{
"drugName":"Drug A",
"lotNumber":"LOT-001",
"origin":"St. Louis",
"temperature":"2-8C"
}
}'

