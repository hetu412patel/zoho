import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import axios from 'axios';

function App() {
  const handleZohoLogin = async () => {
    // const response = await fetch('https://ipinfo.io/json');
    // const data = await response.json();
    // const country = data.country;
    window.location.href = `http://localhost:5000/auth/zoho`;
  };

  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>Zoho Books Integration</h1>
          <button onClick={handleZohoLogin}>Login with Zoho</button>
        </header>
        <Routes>
          <Route path="/oauth2callback" element={<OAuth2Callback />} />
        </Routes>
      </div>
    </Router>
  );
}

const OAuth2Callback = () => {
  const [accessToken, setAccessToken] = useState('');
  const [customerData, setCustomerData] = useState('');

  const findContactByName = (contacts, name) => {
    return contacts.find(contact => contact.contact_name === name);
  };

  useEffect(() => {
    const fetchAccessToken = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (code) {
        const response = await axios.get(`http://localhost:5000/oauth2callback?code=${code}`);
        const accessTokenResponse = response?.data?.tokenData?.access_token;
        setAccessToken(response?.data?.tokenData?.access_token);

        if (accessTokenResponse) {
          const organizationData = await axios.get(`http://localhost:5000/get-organization?access_token=${accessTokenResponse}`);
          const organizationId = organizationData?.data[0]?.organization_id;

          if (organizationId) {
            const getContact = await axios.get(`http://localhost:5000/get-contacts?access_token=${accessTokenResponse}&organization_id=${organizationId}`);
            setCustomerData(getContact?.data?.data);

            const customerName = getContact?.data?.customer_name;
            let contact = findContactByName(getContact?.data?.data, customerName);
            if (!contact) {
              const createContact = await axios.post(`http://localhost:5000/create-contact?access_token=${accessTokenResponse}&organization_id=${organizationId}&contact_name=${customerName}`);
              contact = createContact?.data?.contact;
            }
            
            if (contact) {
              const customer_id = contact?.contact_id;
              const invoiceResponse = await axios.post(`http://localhost:5000/export-data?access_token=${accessTokenResponse}&organization_id=${organizationId}&customer_id=${customer_id}`);
              console.log('Invoice created:', invoiceResponse?.data);
            }
          }
        }
      }
    };
    fetchAccessToken();
  }, []);

  return (
    <div>
      {accessToken ? (
        <div>AccessToken: {accessToken}</div>
      ) : (
        <div>Loading...</div>
      )}
    </div>
  );
};

export default App;
