import { generateCarrierTaskText, llmAvailable } from '../app/services/llm.server';

console.log('LLM available:', llmAvailable());

if (llmAvailable()) {
  const text = await generateCarrierTaskText({
    storeName: 'Acme Supply Co.',
    agentName: 'Riley',
    carrierName: 'UPS',
    trackingNumber: '1Z999AA10123456784',
    shipDate: 'July 24, 2026',
    deliveryClaimDate: 'July 28, 2026',
    shipToSummary: '118 Cedar Street, Portland OR 97214',
    policyInstructions: 'Carrier traces require approval before any Shopify action.',
    orderContext: 'Order #1043 — $124.00 — customer Alex Johnson paid 3 weeks ago, UPS marked delivered but customer says package never arrived. Merchant has emailed twice with no reply.',
  });

  if (text) {
    console.log('=== LLM-Generated Task Text ===');
    console.log(text);
    console.log('');
    console.log('Length:', text.length, 'chars');
  } else {
    console.log('LLM call failed — would fall back to static template');
  }
} else {
  console.log('No LLM configured — using static templates');
}
