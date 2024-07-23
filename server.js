const express = require('express');
const app = express();
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const qs = require('qs');

dotenv.config();
app.use(cors());

const port = process.env.PORT;
const invoiceData = require('./exportData.json');

const generateUniqueInvoiceNumber = (baseInvoiceNumber) => {
  const timestamp = new Date().getTime();
  return `${baseInvoiceNumber}-${timestamp}`;
};

// Prepare data for Zoho Books create invoice API
const invoiceNumber = invoiceData.find(item => item.label === 'InvoiceNumber').value;
const uniqueInvoiceNumber = generateUniqueInvoiceNumber(invoiceNumber);
const customerName = invoiceData.find(item => item.label === 'ClientName').value;
const totalTaxAmount = parseFloat(invoiceData.find(item => item.label === 'TotalTaxesAmount').value.replace(/,/g, ''));
const totalSubTotal = parseFloat(invoiceData.find(item => item.label === 'TotalTaxableAmount').value.replace(/,/g, ''));
const total = totalSubTotal + totalTaxAmount;
const customerAddress = invoiceData.find(item => item.label === 'ClientAddress').value;
const customerTaxNumber = invoiceData.find(item => item.label === 'ClientTaxNumber').value;
// lineItems for Zoho Books create invoice API
const lineItems = invoiceData.filter(item => item.product);
const groupedLineItems = lineItems.reduce((acc, item) => {
  const product = item.product;
  if (!acc[product]) acc[product] = {};
  acc[product][item.label] = item.value;
  return acc;
}, {});
// lineItems array for Zoho Books create invoice API
const lineItemsArray = Object.keys(groupedLineItems).map(product => {
  const item = groupedLineItems[product];
  return {
    description: item.Description,
    quantity: parseFloat(item.Qty),
    unit_price: parseFloat(item.NetPrice),
    tax: parseFloat(item.Tax.replace(/,/g, '')),
    rate: parseFloat(item.NetPrice)
  };
});

app.get('/auth/zoho', (req, res) => {
  const zohoAuthUrl = `https://accounts.zoho.in/oauth/v2/auth?response_type=code&access_type=offline&client_id=${process.env.ZOHO_CLIENT_ID}&redirect_uri=${process.env.ZOHO_REDIRECT_URL}&scope=ZohoBooks.fullaccess.all`;
  res.redirect(zohoAuthUrl);
});

app.get('/oauth2callback', async (req, res) => {
  try {
    const data = {
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      code: req.query.code,
      redirect_uri: process.env.ZOHO_REDIRECT_URL,
      grant_type: 'authorization_code'
    };
    const tokenResponse = await axios.post('https://accounts.zoho.in/oauth/v2/token', qs.stringify(data), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    res.json({ tokenData: tokenResponse.data });
  } catch (error) {
    console.error('Error fetching access token:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/get-organization', async (req, res) => {
  try {
    const response = await axios.get(`https://www.zohoapis.in/books/v3/organizations`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${req.query.access_token}`,
      }
    });
    res.json(response?.data?.organizations);
  } catch (error) {
    console.log('error', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/get-contacts', async (req, res) => {
  try {
    const response = await axios.get(`https://www.zohoapis.in/books/v3/contacts?organization_id=${req.query.organization_id}`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${req.query.access_token}`,
      }
    });
    res.json({ data: response?.data?.contacts, customer_name: customerName });
  } catch (error) {
    console.log('error', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/create-contact', async (req, res) => {
  try {
    // create contact
    const response = await axios.post(`https://www.zohoapis.in/books/v3/contacts?organization_id=${req.query.organization_id}`, { contact_name: req.query.contact_name }, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${req.query.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(response?.data);
  } catch (error) {
    console.error('Failed to create invoice', error);
    res.status(500).send('Failed to create invoice');
  }
})

// after handling contacts in zoho besides that also handle items also.
// 1. if items exists then retrieved it from zoho database via GET request else create new items via POST request
// Items has two category: sales items (for invoices) and purchases items (for receipts)
// After handling items prepare payload for create invoice and call POST request to create invoice.

app.post('/export-data', async (req, res) => {
  try {
    // create invoice
    const response = await axios.post(`https://www.zohoapis.in/books/v3/invoices?organization_id=${req.query.organization_id}`, {
      customer_id: req.query.customer_id,
      invoice_number: uniqueInvoiceNumber,
      customer_name: customerName,
      customer_address: customerAddress,
      customer_tax_number: customerTaxNumber,
      sub_total: totalSubTotal,
      tax_total: totalTaxAmount,
      total: total,
      line_items: lineItemsArray,
    }, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${req.query.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    res.status(200).send(response?.data);
  } catch (error) {
    console.log('error', error);
    res.status(500).send('Failed to create invoice');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});