import requests
import json

def test_routes():
    url = "http://127.0.0.1:8000/recommend-routes"
    payload = {
        "start_lat": 19.2183,
        "start_lon": 72.9781,
        "end_lat": 27.1751, # Agra
        "end_lon": 78.0421
    }
    
    print(f"Testing routes for Mumbai to Agra...")
    try:
        resp = requests.post(url, json=payload, timeout=60)
        data = resp.json()
        
        routes = data.get("routes", [])
        print(f"Found {len(routes)} routes.")
        
        for r in routes:
            path = r.get("route_path", [])
            print(f"Route {r['id']}: {len(path)} points. First point: {path[0] if path else 'N/A'}")
            
        if len(routes) >= 2:
            path1 = routes[0].get("route_path", [])
            path2 = routes[1].get("route_path", [])
            if path1 == path2:
                print("ERROR: Route 1 and Route 2 have IDENTICAL paths!")
            else:
                print("SUCCESS: Route 1 and Route 2 have different paths.")
                
    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == "__main__":
    test_routes()
