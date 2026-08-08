import { CallePhoneSupportProvider } from '../app/providers/calle-provider.server';
import { buildCarrierTraceTask, getResultSchema } from '../app/lib/call-plan';

const provider = new CallePhoneSupportProvider();

const taskText = buildCarrierTraceTask({
  agentName: 'Riley',
  storeName: 'Northstar Supply Co.',
  carrierName: 'Northline Freight',
  trackingNumber: 'NL4820199317',
  shipDate: '24 July 2026',
  deliveryClaimDate: '28 July 2026',
  shipToSummary: 'front porch, Portland OR',
  policyInstructions: '',
});

const schema = getResultSchema('CARRIER_TRACE');

console.log('Task text length:', taskText.length, 'chars');
console.log('Placing carrier trace call to +17273253436...');

const created = await provider.createCall({
  recipientPhone: '+17273253436',
  region: 'US',
  locale: 'en-US',
  idempotencyKey: 'carrier_test_' + Date.now(),
  taskText,
  resultSchema: schema,
  metadata: { product: 'callmemaybe', purpose: 'carrier_trace_verification' },
});

console.log('Call ID:', created.providerCallId);
console.log('Status:', created.status);

const deadline = Date.now() + 10 * 60 * 1000;
let call = await provider.getCall(created.providerCallId);
while (!['COMPLETED', 'FAILED', 'CANCELED'].includes(call.status) && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 5000));
  call = await provider.getCall(created.providerCallId);
  process.stdout.write('.');
}

console.log('');
console.log('Final status:', call.status);
console.log('Outcome:', call.outcome);
console.log('Task completed:', call.taskCompleted);
console.log('Confidence:', call.completionConfidenceScore, '(', call.completionConfidenceLabel, ')');
console.log('Summary:', call.summary);
console.log('Structured result:', JSON.stringify(call.structuredResult, null, 2));
if (call.transcript) {
  console.log('Transcript (first 500 chars):', call.transcript.substring(0, 500));
}
