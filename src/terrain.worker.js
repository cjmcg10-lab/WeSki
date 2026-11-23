// Background worker for opening a map: the ground's heavy set-up (src/terrainprep.js) runs here so the screen stays
// responsive, and the typed arrays are handed back without copying.
import { prepTerrain, prepBuffers } from './terrainprep.js';

self.onmessage = (e) => {
  const p = prepTerrain(e.data);
  self.postMessage(p, prepBuffers(p));
};
