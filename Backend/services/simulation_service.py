import random
import threading
import time
import logging
from datetime import datetime, timezone
from Backend.utils.firebase_helper import get_firestore_client, get_active_deliveries_count

logger = logging.getLogger("simulation_service")

# Global flag to prevent multiple simulation threads
simulation_running = False

def simulate_deliveries(max_active: int = 20, interval: int = 5):
    """
    Background loop that simulates delivery activity in Firebase.
    """
    logger.info("Starting background delivery simulation...")
    
    while True:
        try:
            # Re-fetch or init client in case of failure
            db = get_firestore_client()
            
            # Check current active count
            active_count = get_active_deliveries_count()
            
            # Decide on an action
            action = random.choice(["add", "complete", "idle"])
            
            if action == "add":
                # Only add if Firebase is healthy (count >= 0) and under limit
                if 0 <= active_count < max_active:
                    db.collection("deliveries").add({
                        "status": "active",
                        "start_time": datetime.now(timezone.utc),
                        "type": "simulated"
                    })
                    logger.info(f"Simulation: Added active delivery. Current count: {active_count + 1}")
                elif active_count < 0:
                    logger.warning("Simulation: Firebase error detected. Skipping addition.")
                else:
                    logger.debug("Simulation: Max active deliveries reached. Skipping add.")
            
            elif action == "complete":
                if active_count > 0:
                    docs = db.collection("deliveries").where("status", "==", "active").limit(5).stream()
                    active_docs = list(docs)
                    
                    if active_docs:
                        doc = random.choice(active_docs)
                        doc.reference.update({
                            "status": "completed",
                            "end_time": datetime.now(timezone.utc)
                        })
                        logger.info(f"Simulation: Completed delivery {doc.id}")
                else:
                    logger.debug("Simulation: No active deliveries to complete.")
            
            else:
                logger.debug("Simulation: Idle cycle.")
                
            time.sleep(interval)
            
        except Exception as e:
            logger.error(f"Simulation loop error: {e}")
            time.sleep(interval * 2) # Exponential-ish backoff


def start_simulation(max_active: int = 20, interval: int = 5):
    """
    Launches the simulation in a background daemon thread.
    """
    global simulation_running
    if simulation_running:
        logger.warning("Simulation is already running.")
        return False
        
    thread = threading.Thread(
        target=simulate_deliveries, 
        args=(max_active, interval), 
        daemon=True
    )
    thread.start()
    simulation_running = True
    return True
