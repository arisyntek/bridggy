# Bridggy TypeScript Client

Client for the Bridggy proxy service that handles cross-origin requests.

## Installation

```bash
npm i @bridggy/client
```

## Usage

### Initialize the client

```typescript
import { bridggy } from '@bridggy/client';

const config = {
  token: 'PROXY_TOKEN'
};

bridggy.configure(config);
```

### Make requests
Example GET request.

```javascript
import { bridggy } from '@bridggy/client';

const response = await bridggy.fetch('https://kimiquotes.pages.dev/api/quote');

const data = await response.json();
```

## License

MIT
