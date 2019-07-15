// https://aaronparecki.com/oauth-2-simplified/#web-server-apps
/**
 * Encode & parse jwt token
 * @returns {object}
 * @throws {Error}
 */
const parseJwtToken = function(token) {
    const base64Url = token.split('.')[1];
    const encoded = base64Url.replace('-', '+').replace('_', '/');
    const payload = Buffer.from(encoded, 'base64').toString();
    return JSON.parse(payload);
};


const serializeUriParams = function(params) {
    let uri = '';
    Object.keys(params).forEach((key, index) => {
        if (index > 0) {
            uri += '&';
        }
        uri += `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
    });
    return uri;
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    parseJwtToken,
    serializeUriParams,
    sleep,
};
