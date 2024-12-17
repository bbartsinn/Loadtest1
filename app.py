from flask import Flask
from flask_cors import CORS
from app.routes import api

app = Flask(__name__, static_folder='app/static', static_url_path='')
CORS(app)

# Register blueprint with clear prefix
app.register_blueprint(api, url_prefix='/api')

@app.route('/')
def index():
    # Serve the frontend index.html
    return app.send_static_file('index.html')

if __name__ == '__main__':
    app.run(debug=True)
