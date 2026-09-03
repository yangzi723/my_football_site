from flask import Flask
app = Flask(__name__)

@app.route('/')
def home():
    return 'Hello'

if __name__ == '__main__':
    print('启动 Flask...')
    app.run(debug=True, port=5000)