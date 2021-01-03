const cors = require('cors')
import express = require('express');
import bodyParser = require('body-parser');
import { ConfigurationManager } from '../configuration/configurationManager';
import { EventsListManager } from './eventsListManager';

// Init express engine
const app: express.Application = express();
app.use(cors());
app.use(bodyParser.json(
    {
        limit: '10mb',
    }));

// Init API calls
app.post('/events/data', async (req, res) => {
    try {
        return res.send(200);
    } catch (error) {
        return res.sendStatus(500).send(error.message);
    }
});

const eventsListManager = new EventsListManager();
eventsListManager.start();

app.listen(ConfigurationManager.getServerPort(), function () {
    console.log(`App is listening on port ${ConfigurationManager.getServerPort()}!`);
});

