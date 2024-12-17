document.addEventListener('DOMContentLoaded', () => {
  // Toggle visibility of load groups based on checkboxes
  document.querySelectorAll('.toggle-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const targetId = e.target.getAttribute('data-target');
      const targetEl = document.getElementById(targetId);
      if (e.target.checked) {
        targetEl.classList.remove('hidden');
      } else {
        targetEl.classList.add('hidden');
      }
    });
  });

  // Toggle unit sections based on selected unit types
  const unitCheckboxes = document.querySelectorAll('.unit-toggle');
  const unitSections = document.querySelectorAll('.unit-section');
  const updateUnitsVisibility = () => {
    unitSections.forEach(section => {
      const unitType = section.getAttribute('data-unit');
      const checked = Array.from(unitCheckboxes).some(c => c.value === unitType && c.checked);
      if (checked) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    });
  };
  unitCheckboxes.forEach(cb => cb.addEventListener('change', updateUnitsVisibility));
  updateUnitsVisibility(); // initialize on load

  // Handle additional loads table row adding/removing
  document.querySelectorAll('.addRowBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.additional-loads-container');
      const tbody = container.querySelector('tbody');
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><input type="text" class="desc-input" placeholder="Description" required></td>
        <td><input type="number" class="watts-input" min="1501" step="1" placeholder="Wattage > 1500" required></td>
        <td><button type="button" class="remove-row-btn">Remove</button></td>
      `;
      tbody.appendChild(row);
      row.querySelector('.remove-row-btn').addEventListener('click', () => {
        tbody.removeChild(row);
      });
    });
  });

  document.getElementById('loadCalcForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const conductorType = document.getElementById('conductorType').value;

    // Identify which units are selected
    const selectedUnits = Array.from(document.querySelectorAll('.unit-toggle:checked')).map(cb => cb.value);

    // A helper function to safely parse a number from an input
    const parseNumber = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return 0;
      const val = parseFloat(el.value);
      return isNaN(val) ? 0 : val;
    };

    // Function to get load values from a unit
    const getUnitData = (unit) => {
      const prefix = '_' + unit; // SFD, SS, LWH

      const livingArea = parseNumber(`[name="livingArea${prefix}"]`);

      // Checkboxes for loads
      const electricHeatingChecked = document.querySelector(`[data-target="electricHeatingLoadGroup${prefix}"]`)?.checked;
      const electricHeatingWatts = electricHeatingChecked ? parseNumber(`[name="electricHeatingWatts${prefix}"]`) : 0;

      const acChecked = document.querySelector(`[data-target="acLoadGroup${prefix}"]`)?.checked;
      const acWatts = acChecked ? parseNumber(`[name="acWatts${prefix}"]`) : 0;

      // Heating/Cooling Interlocked checkbox
      const interlockEl = document.querySelector(`.heating-cooling-interlock[data-unit="${unit}"]`);
      const heatingCoolingInterlocked = interlockEl ? interlockEl.checked : false;

      const rangeChecked = document.querySelector(`[data-target="rangeLoadGroup${prefix}"]`)?.checked;
      let rangeWatts = 0;
      if (rangeChecked) {
        rangeWatts = parseInt(document.querySelector(`[name="rangeWatts${prefix}"]`)?.value || 0, 10);
        if (isNaN(rangeWatts)) rangeWatts = 0;
      }

      const tanklessChecked = document.querySelector(`[data-target="tanklessLoadGroup${prefix}"]`)?.checked;
      const tanklessWatts = tanklessChecked ? parseNumber(`[name="tanklessWatts${prefix}"]`) : 0;

      const steamerChecked = document.querySelector(`[data-target="steamerLoadGroup${prefix}"]`)?.checked;
      const steamersWatts = steamerChecked ? parseNumber(`[name="steamersWatts${prefix}"]`) : 0;

      const poolChecked = document.querySelector(`[data-target="poolLoadGroup${prefix}"]`)?.checked;
      const poolHotTubWatts = poolChecked ? parseNumber(`[name="poolHotTubWatts${prefix}"]`) : 0;

      const evChecked = document.querySelector(`[data-target="evLoadGroup${prefix}"]`)?.checked;
      const evChargingWatts = evChecked ? parseNumber(`[name="evChargingWatts${prefix}"]`) : 0;

      // Additional loads
      let additional_total = 0;
      const additionalContainer = document.querySelector(`.additional-loads-container[data-unit="${unit}"]`);
      if (additionalContainer) {
        const wattInputs = additionalContainer.querySelectorAll('.watts-input');
        wattInputs.forEach(input => {
          const val = parseFloat(input.value) || 0;
          if (val > 1500) additional_total += val;
        });
      }

      return {
        "area_m2": livingArea,
        "space_heating": electricHeatingWatts,
        "air_conditioning": acWatts,
        "heating_cooling_interlocked": heatingCoolingInterlocked,
        "range_watts": rangeWatts,
        "additional_load": additional_total,
        "tankless_watts": tanklessWatts,
        "steamer_watts": steamersWatts,
        "pool_hot_tub_watts": poolHotTubWatts,
        "ev_charging_watts": evChargingWatts
      };
    };

    const units = selectedUnits.map(u => getUnitData(u));

    const data = {
      "num_units": units.length,
      "units": units,
      "conductor_type": conductorType
    };

    try {
      const response = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "An error occurred during calculation.");
      }

      const resultData = await response.json();

      const resultDiv = document.getElementById('result');
      resultDiv.style.display = 'block';

      const unitsData = resultData.units || [];
      let html = `<h2>Calculation Results</h2>`;
      html += `<p><strong>Total Calculated Load (Watts):</strong> ${resultData["Total Calculated Load (Watts)"]}</p>`;
      html += `<p><strong>Total Amps:</strong> ${resultData["Total Amps"].toFixed(2)}</p>`;

      if (unitsData.length === 1) {
        // Single unit scenario (SFD only)
        html += `<p><strong>Service OCP Size (Amps):</strong> ${resultData["Service OCP size (Amps)"]}</p>`;
        html += `<p><strong>Service Conductor Type and Size:</strong> ${resultData["Service Conductor Type and Size"]}</p>`;
        // Do not show unit details
      } else if (unitsData.length > 1) {
        // Multiple units scenario
        html += `<p><strong>Service Conductor Type and Size:</strong> ${resultData["Service Conductor Type and Size"]}</p>`;
        // Show units detail
        html += `<h3>Units Detail</h3>`;
        unitsData.forEach(unit => {
          html += `<div class="unit-result">`;
          html += `<p><strong>Unit ${unit.unit_index}:</strong></p>`;
          html += `<p>Area (m²): ${unit.area_m2}</p>`;
          html += `<p>Total Unit Load (Watts): ${unit.total_unit_load_watts}</p>`;
          html += `<p>Unit Amps: ${unit.unit_amps.toFixed(2)} A</p>`;
          html += `<p>Unit Panel OCP Size: ${unit.unit_panel_ocp_size}</p>`;
          html += `<p>Unit Panel Conductor: ${unit.unit_panel_conductor}</p>`;
          html += `</div>`;
        });
      }

      resultDiv.innerHTML = html;

    } catch (err) {
      console.error(err);
      const resultDiv = document.getElementById('result');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `<p style="color:red;">${err.message}</p>`;
    }
  });
});
