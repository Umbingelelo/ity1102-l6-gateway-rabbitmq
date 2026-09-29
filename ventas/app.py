from flask import Flask, jsonify, request

app = Flask(__name__)

@app.post('/sales')
def sale():
    return jsonify(status='registrada', transaction_id='TXN-12345'), 201

@app.get('/sales')
def list_sales():
    return jsonify(status='sin ventas persistidas', sales=[])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
