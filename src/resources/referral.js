/* eslint-disable import/no-cycle */
import T from 'proptypes';
import superagent from 'superagent';

import API from '../easypost';
import base from './base';
import { propTypes as userPropTypes } from './user';

export const propTypes = Object.assign({}, userPropTypes, {
  name: T.string.isRequired,
  email: T.string.isRequired,
  phone: T.string.isRequired,
});

/**
 * Get an instance of the API client using the referral user's API key.
 * @param {API} api - The API client to copy.
 * @param {string} referralApiKey - The referral user's API key.
 * @returns {API} - An instance of the API client.
 */
function getReferralApi(api, referralApiKey) {
  return API.copyApi(api, {
    apiKey: referralApiKey,
  });
}

/**
 * Get EasyPost's Stripe API key used to create credit cards on Stripe's servers.
 * @param {API} api - The API client to use.
 * @returns {string} - The Stripe API key.
 */
async function getEasyPostStripeKey(api) {
  const response = await api.get('partners/stripe_public_key');

  return response.body.public_key;
}

/**
 * Send the credit card details to Stripe to get a Stripe credit card token.
 * @param {string} stripeKey - The Stripe API key.
 * @param {string} number - Credit card number.
 * @param {string} expirationMonth - Credit card expiration month.
 * @param {string} expirationYear - Credit card expiration year.
 * @param {string} cvc - Credit card CVC.
 * @returns {Promise<string>} - Stripe credit card token.
 */
async function sendCardDetailsToStripe(stripeKey, number, expirationMonth, expirationYear, cvc) {
  // Stripe's endpoint requires form-encoded requests
  const request = superagent
    .post(
      `https://api.stripe.com/v1/tokens?card[number]=${number}&card[exp_month]=${expirationMonth}&card[exp_year]=${expirationYear}&card[cvc]=${cvc}`,
    )
    .set({
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });

  try {
    const response = await request;

    return response.body.id;
  } catch (error) {
    throw new Error('Could not send card details to Stripe, please try again later');
  }
}

/**
 * Send the Stripe credit card token to EasyPost to add the card to the user's account.
 * @param {API} api - The API client to use.
 * @param {string} referralApiKey - The referral user's production API key.
 * @param {string} stripeCreditCardToken - Stripe credit card token.
 * @param {string} priority - Whether to add the card as the 'primary' or 'secondary' card.
 * @returns {Object} - Response body (EasyPost payment method object).
 */
async function sendCardDetailsToEasyPost(api, referralApiKey, stripeCreditCardToken, priority) {
  const _api = getReferralApi(api, referralApiKey);
  const params = { credit_card: { stripe_object_id: stripeCreditCardToken, priority } };
  const response = await _api.post('credit_cards', params);

  return response.body;
}

export default (api) =>
  class Referral extends base(api) {
    static _name = 'Referral';

    static _url = 'referral_customers';

    static key = 'user';

    static propTypes = propTypes;

    /**
     * Update the referral's email address.
     * @param {string} referralUserId - The referral user's ID.
     * @param {string} email - The new email address.
     * @returns {Promise<boolean>} - Returns true if the referral was updated successfully, false otherwise.
     */
    static async updateEmail(referralUserId, email) {
      const newParams = { user: { email } };
      await api.put(`${this._url}/${referralUserId}`, newParams); // will throw if there's an error

      return true;
    }

    /**
     * Add a credit card to the referral's account
     * @param {string} referralApiKey - The referral user's production API key.
     * @param {string} number - The credit card number.
     * @param {string} expirationMonth - The credit card expiration month.
     * @param {string} expirationYear - The credit card expiration year.
     * @param {string} cvc - The credit card CVC.
     * @param {string} priority - Whether to add the card as 'primary' or 'secondary' payment method (defaults to 'primary').
     * @returns {Promise<never>} - Response body (EasyPost payment method object).
     */
    static async addCreditCard(
      referralApiKey,
      number,
      expirationMonth,
      expirationYear,
      cvc,
      priority = 'primary',
    ) {
      const stripeKey = await getEasyPostStripeKey(api); // will throw if there's an error

      const stripeCreditCardId = await sendCardDetailsToStripe(
        stripeKey,
        number,
        expirationMonth,
        expirationYear,
        cvc,
      ); // will throw if there's an error

      const paymentMethod = await sendCardDetailsToEasyPost(
        api,
        referralApiKey,
        stripeCreditCardId,
        priority,
      ); // will throw if there's an error

      return paymentMethod;
    }

    /**
     * retrieve not implemented.
     * @returns {this}
     */
    // eslint-disable-next-line no-unused-vars
    static async retrieve(id, urlPrefix) {
      return this.notImplemented('retrieve');
    }
  };
