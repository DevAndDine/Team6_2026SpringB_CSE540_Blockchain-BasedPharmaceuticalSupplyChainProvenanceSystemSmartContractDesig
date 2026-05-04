curl -X POST http://localhost:5001/api/create-batch \
-H "Content-Type: application/json" \
-d '{
"id":2,
"metadata":{
"drugName":"Drug B",
"lotNumber":"LOT-001",
"origin":"Kansas City",
"temperature":"28C"
}
}'


