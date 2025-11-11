import assert from 'node:assert';
import { Types } from 'mongoose';
import { buildDefaultTimeline, completeTimelinePhase } from '../modules/projekti/controllers/projectController';
import { TIMELINE_PHASES } from '../modules/projekti/models/TimelineEvent';

function testDefaultTimeline() {
  const timeline = buildDefaultTimeline();
  assert.strictEqual(
    timeline.length,
    TIMELINE_PHASES.length,
    'Privzeta časovnica mora vsebovati vse faze'
  );
  timeline.forEach((event, index) => {
    assert.strictEqual(event.phase, TIMELINE_PHASES[index], 'Faze so v pravilnem zaporedju');
    assert.strictEqual(event.status, 'pending', 'Vsaka faza naj ima status pending');
    assert.strictEqual(event.confirmed, false, 'Faza še ni potrjena');
  });
}

function testCompleteTimelinePhase() {
  const timeline = buildDefaultTimeline();
  const documentId = new Types.ObjectId();
  const updated = completeTimelinePhase(timeline, 'offer', documentId);

  const offerEvent = updated.find((event) => event.phase === 'offer');
  assert(offerEvent, 'Ponudba mora obstajati v časovnici');
  assert.strictEqual(offerEvent?.status, 'completed', 'Status se mora spremeniti v completed');
  assert.strictEqual(offerEvent?.confirmed, true, 'Faza je potrjena');
  assert(offerEvent?.documentId, 'Dokument mora biti povezan');
}

async function run() {
  console.log('Začenjam teste za projektni kontroler...');
  testDefaultTimeline();
  testCompleteTimelinePhase();
  console.log('Vsi testi uspešno prestali.');
}

run().catch((error) => {
  console.error('Testi so padli:', error);
  process.exit(1);
});
