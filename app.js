const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use('/resources', express.static(path.join(__dirname, 'resources')));

// Import route files
const indexRoutes = require('./routes/index');
const journalsRoutes = require('./routes/journals');
const writeRoutes = require('./routes/write');

// Use route files
app.use('/', indexRoutes);
app.use('/journals', journalsRoutes);
app.use('/write', writeRoutes);


app.listen(3000, () => {
  log('Server is running on port 3000');
});
