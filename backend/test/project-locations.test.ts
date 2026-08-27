import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCanonicalLocationsFromZahteva,
  sanitizeCanonicalProjectLocations,
} from '../modules/projects/services/project-locations.service';

test('requirement locations receive stable project-wide photo identifiers', () => {
  const locations = buildCanonicalLocationsFromZahteva({
    _id: 'req-1',
    sistemi: [
      {
        id: 'sys-video',
        tip: 'videonadzor',
        videonadzor: { lokacije: [{ id: 'loc-1', ime: 'Glavni vhod' }] },
      },
      {
        id: 'sys-alarm',
        tip: 'alarm',
        alarm: { lokacije: [{ id: 'loc-2', ime: 'Pisarna' }] },
      },
    ],
  });

  assert.deepEqual(locations, [
    {
      id: 'zahteva-location:req-1:sys-video:loc-1',
      name: 'Glavni vhod',
      note: '',
      sourcePhotoItemId: 'zahteva-location:req-1:sys-video:loc-1',
    },
    {
      id: 'zahteva-alarm-location:req-1:sys-alarm:loc-2',
      name: 'Pisarna',
      note: '',
      sourcePhotoItemId: 'zahteva-alarm-location:req-1:sys-alarm:loc-2',
    },
  ]);
});

test('existing canonical identifiers survive renames in requirements', () => {
  const [location] = buildCanonicalLocationsFromZahteva({
    _id: 'req-1',
    sistemi: [{
      id: 'sys-1',
      tip: 'videonadzor',
      videonadzor: {
        lokacije: [{
          id: 'legacy-local-id',
          ime: 'Preimenovana lokacija',
          projectLocationId: 'project-location-1',
          sourcePhotoItemId: 'shared-photo-location-1',
        }],
      },
    }],
  });

  assert.equal(location.id, 'project-location-1');
  assert.equal(location.sourcePhotoItemId, 'shared-photo-location-1');
  assert.equal(location.name, 'Preimenovana lokacija');
});

test('canonical locations are deduplicated by stable id', () => {
  const locations = sanitizeCanonicalProjectLocations([
    { id: 'loc-1', name: 'Staro ime' },
    { id: 'loc-1', name: 'Novo ime', sourcePhotoItemId: 'photo-1' },
  ]);

  assert.equal(locations.length, 1);
  assert.equal(locations[0].name, 'Novo ime');
  assert.equal(locations[0].sourcePhotoItemId, 'photo-1');
});
