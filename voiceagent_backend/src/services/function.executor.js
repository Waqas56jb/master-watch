const { apiClient, authClient } = require("../utils/apiClient");
const { geocode } = require("../utils/geocoder");

// Executes the function the AI decided to call, returns result as string
const executeFunction = async (name, args, token) => {
  const client      = apiClient;
  const authHttp    = token ? authClient(token) : null;

  const requireAuth = (action) => {
    if (!authHttp) throw new Error("AUTH_REQUIRED");
    return action(authHttp);
  };

  try {
    switch (name) {

      // ── Config ──────────────────────────────────────────────
      case "get_airports":
        return await client.get("/v1/customers/config/airports").then(r => r.data);

      case "get_vehicle_types":
        return await client.get("/v1/customers/config/vehicle-types").then(r => r.data);

      case "get_passenger_types":
        return await client.get("/v1/customers/config/passenger-types").then(r => r.data);

      case "get_child_seat_types":
        return await client.get("/v1/customers/config/child-seat-types").then(r => r.data);

      case "get_luggage_types":
        return await client.get("/v1/customers/config/luggage-types").then(r => r.data);

      case "validate_discount_code":
        return await client.post("/v1/customers/config/discount-codes/validate", { code: args.code }).then(r => r.data);

      // ── Route & Cost ─────────────────────────────────────────
      case "calculate_route": {
        const [origin, destination] = await Promise.all([
          geocode(args.origin_address),
          geocode(args.destination_address),
        ]);
        return await client.post("/v1/customers/trips/calculate-route", {
          origin,
          destination,
          avoid_tolls:    args.avoid_tolls    ?? false,
          avoid_highways: args.avoid_highways ?? false,
        }).then(r => r.data);
      }

      case "calculate_cost":
        return await client.post("/v1/customers/trips/calculate-cost", {
          route_hash:          args.route_hash,
          trip_direction:      args.trip_direction,
          discount_code:       args.discount_code,
          gratuity_percentage: args.gratuity_percentage,
          passenger_types:     args.passenger_types,
          child_seats:         args.child_seats,
          luggage:             args.luggage,
        }).then(r => r.data);

      // ── Auth ─────────────────────────────────────────────────
      case "login":
        return await client.post("/v1/customers/auth/login", {
          email: args.email, password: args.password,
        }).then(r => r.data);

      case "register":
        return await client.post("/v1/customers/auth/register", {
          first_name:            args.first_name,
          last_name:             args.last_name,
          email:                 args.email,
          password:              args.password,
          password_confirmation: args.password,
        }).then(r => r.data);

      case "request_otp":
        return await client.post("/v1/customers/auth/otp/request", { email: args.email }).then(r => r.data);

      case "verify_otp":
        return await client.post("/v1/customers/auth/otp/verify", { email: args.email, otp: args.otp }).then(r => r.data);

      case "reset_password":
        return await client.post("/v1/customers/auth/password/reset", {
          email: args.email, otp: args.otp,
          password: args.password, password_confirmation: args.password_confirmation,
        }).then(r => r.data);

      // ── Trips (Protected) ─────────────────────────────────────
      case "create_trip":
        return requireAuth(h => h.post("/v1/customers/trips", args).then(r => r.data));

      case "confirm_trip":
        return requireAuth(h => h.post(`/v1/customers/trips/${args.trip_id}/confirm`).then(r => r.data));

      case "get_trips":
        return requireAuth(h => h.get("/v1/customers/trips").then(r => r.data));

      case "get_trip_by_id":
        return requireAuth(h => h.get(`/v1/customers/trips/${args.trip_id}`).then(r => r.data));

      case "cancel_trip":
        return requireAuth(h => h.post(`/v1/customers/trips/${args.trip_id}/cancel`, {
          cancellation_reason: args.cancellation_reason || "Customer requested cancellation",
        }).then(r => r.data));

      case "get_cancellation_policy":
        return requireAuth(h => h.get(`/v1/customers/trips/${args.trip_id}/cancellation-policy`).then(r => r.data));

      case "book_return_trip":
        return requireAuth(h => h.post(`/v1/customers/trips/${args.trip_id}/return`, {
          scheduled_at: args.scheduled_at,
        }).then(r => r.data));

      case "send_driver_message":
        return requireAuth(h => h.post(`/v1/customers/trips/${args.trip_id}/messages`, {
          message: args.message,
        }).then(r => r.data));

      case "get_conversation":
        return requireAuth(h => h.get(`/v1/customers/trips/${args.trip_id}/conversation`).then(r => r.data));

      case "get_feedback_questions":
        return requireAuth(h => h.get("/v1/customers/feedback/questions").then(r => r.data));

      case "submit_feedback":
        return requireAuth(h => h.post(`/v1/customers/trips/${args.trip_id}/feedback`, {
          answers: args.answers,
          comment: args.comment,
        }).then(r => r.data));

      // ── Payments (Protected) ──────────────────────────────────
      case "get_payment_methods":
        return requireAuth(h => h.get("/v1/customers/payment-methods").then(r => r.data));

      case "add_payment_method":
        return requireAuth(h => h.post("/v1/customers/payment-methods", args).then(r => r.data));

      case "delete_payment_method":
        return requireAuth(h => h.delete(`/v1/customers/payment-methods/${args.payment_method_id}`).then(r => r.data));

      case "set_default_payment_method":
        return requireAuth(h => h.post(`/v1/customers/payment-methods/${args.payment_method_id}/set-default`).then(r => r.data));

      // ── Account & Notifications (Protected) ───────────────────
      case "get_notifications":
        return requireAuth(h => h.get("/v1/customers/notifications").then(r => r.data));

      case "get_account":
        return requireAuth(h => h.get("/v1/customers/account").then(r => r.data));

      case "logout":
        return requireAuth(h => h.post("/v1/customers/logout").then(r => r.data));

      default:
        return { error: `Unknown function: ${name}` };
    }
  } catch (err) {
    if (err.message === "AUTH_REQUIRED") {
      return { error: "AUTH_REQUIRED", message: "User must be logged in to perform this action." };
    }
    return {
      error: true,
      status: err?.response?.status,
      message: err?.response?.data?.message || err.message,
      details: err?.response?.data,
    };
  }
};

module.exports = { executeFunction };
