# routes.py

from flask import Blueprint, request, jsonify
from app.services.calculation_engine import (
    calculate_unit_loads,
    combined_load,
    calculate_service_parameters
)

api = Blueprint('api', __name__)

@api.route('/calculate', methods=['POST'])
def calculate():
    data = request.get_json()
    try:
        num_units = data.get("num_units", 1)
        conductor_type = data.get("conductor_type", "Copper")

        units_data = []

        # Load units data
        if "units" in data and isinstance(data["units"], list):
            # If units are directly provided as a list
            for u in data["units"]:
                unit_result = calculate_unit_loads(u, conductor_type)
                if unit_result is not None:
                    units_data.append(unit_result)
        else:
            # Fallback if units not provided as list:
            # Ensure the frontend sends units as a list for simplicity
            for i in range(num_units):
                unit_data = {
                    "area_m2": data.get(f"unit_{i+1}_area_m2", 0),
                    "space_heating": data.get(f"unit_{i+1}_space_heating", 0),
                    "air_conditioning": data.get(f"unit_{i+1}_air_conditioning", 0),
                    "heating_cooling_interlocked": data.get(f"unit_{i+1}_heating_cooling_interlocked", False),
                    "range_watts": data.get(f"unit_{i+1}_range_watts", 0),
                    "additional_load": data.get(f"unit_{i+1}_additional_loads", 0),
                    "tankless_watts": data.get(f"unit_{i+1}_tankless_watts", 0),
                    "steamer_watts": data.get(f"unit_{i+1}_steamer_watts", 0),
                    "pool_hot_tub_watts": data.get(f"unit_{i+1}_pool_hot_tub_watts", 0),
                    "ev_charging_watts": data.get(f"unit_{i+1}_ev_charging_watts", 0)
                }
                unit_result = calculate_unit_loads(unit_data, conductor_type)
                if unit_result is not None:
                    units_data.append(unit_result)

        # If no units
        if not units_data:
            return jsonify({"message": "No valid units provided. No load calculated."})

        # Calculate combined no-HVAC load using CEC Rule 8-200(2)
        combined_no_hvac = combined_load(units_data)

        # Calculate total HVAC load by summing (calculated_load - calculated_load_no_hvac) for each unit
        total_hvac_load = sum(u["calculated_load"] - u["calculated_load_no_hvac"] for u in units_data)

        # Final combined load is combined_no_hvac + total_hvac_load
        final_combined_load = combined_no_hvac + total_hvac_load

        if final_combined_load <= 0:
            return jsonify({"message": "No load calculated."})

        # Calculate service parameters (OCP and conductor)
        service_ocp_label, service_conductor_desc = calculate_service_parameters(final_combined_load, units_data, conductor_type)

        # Build the result
        result = {
            "units": [
                {
                    "unit_index": i+1,
                    "area_m2": u["area_m2"],
                    "total_unit_load_watts": u["calculated_load"],
                    "unit_amps": u["unit_amps"],
                    "unit_panel_ocp_size": u["unit_ocp"],
                    "unit_panel_conductor": u["unit_conductor"]
                } for i, u in enumerate(units_data)
            ],
            "Combined No-HVAC Load (Watts)": combined_no_hvac,
            "Total HVAC Load (Watts)": total_hvac_load,
            "Total Calculated Load (Watts)": final_combined_load,
            "Total Amps": final_combined_load / 240.0,
            "Service OCP size (Amps)": service_ocp_label,
            "Service Conductor Type and Size": service_conductor_desc
        }

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
