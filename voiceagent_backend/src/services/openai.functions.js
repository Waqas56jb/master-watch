// OpenAI Function Definitions — All 31 Chatbot APIs
const functions = [
  // ─── GUEST: Config ───────────────────────────────────────
  {
    name: "get_airports",
    description: "Get list of all supported airports. Call this before telling the user which airports are served.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_vehicle_types",
    description: "Get all available vehicle types with details. Call before showing vehicle options.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_passenger_types",
    description: "Get passenger type options. Call before asking about passenger count.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_child_seat_types",
    description: "Get child seat options with age/weight ranges. Call when user mentions a child.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_luggage_types",
    description: "Get luggage type options and prices. Call when user mentions bags or luggage.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "validate_discount_code",
    description: "Validate a promo or discount code entered by the user.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "The discount/promo code to validate" },
      },
      required: ["code"],
    },
  },

  // ─── GUEST: Trip Calculation ──────────────────────────────
  {
    name: "calculate_route",
    description: "Step 1 of booking. Calculate route between origin and destination. Returns route_hash needed for calculate_cost.",
    parameters: {
      type: "object",
      properties: {
        origin_address:      { type: "string", description: "Full pickup address or airport name" },
        destination_address: { type: "string", description: "Full drop-off address or airport name" },
        avoid_tolls:         { type: "boolean", description: "Whether to avoid tolls" },
        avoid_highways:      { type: "boolean", description: "Whether to avoid highways" },
      },
      required: ["origin_address", "destination_address"],
    },
  },
  {
    name: "calculate_cost",
    description: "Step 2 of booking. Get real price breakdown using route_hash from calculate_route. Returns prices for all vehicles and a new route_hash for create_trip.",
    parameters: {
      type: "object",
      properties: {
        route_hash:          { type: "string", description: "route_hash from calculate_route response" },
        trip_direction:      { type: "string", enum: ["to_airport", "from_airport", "other"], description: "Direction of trip relative to airport" },
        discount_code:       { type: "string", description: "Promo code if user has one" },
        gratuity_percentage: { type: "integer", enum: [18, 20, 23, 25, 30, 35], description: "Tip percentage if user wants to add one" },
        passenger_types: {
          type: "array",
          description: "Passenger types and quantities",
          items: {
            type: "object",
            properties: {
              passenger_type_id: { type: "integer" },
              quantity: { type: "integer" },
            },
          },
        },
        child_seats: {
          type: "array",
          description: "Child seat types and quantities if needed",
          items: {
            type: "object",
            properties: {
              child_seat_type_id: { type: "integer" },
              quantity: { type: "integer" },
            },
          },
        },
        luggage: {
          type: "array",
          description: "Luggage types and quantities if user has baggage",
          items: {
            type: "object",
            properties: {
              luggage_type_id: { type: "integer" },
              quantity: { type: "integer" },
            },
          },
        },
      },
      required: ["route_hash"],
    },
  },

  // ─── GUEST: Auth ──────────────────────────────────────────
  {
    name: "login",
    description: "Login user with email and password. Returns Bearer token on success.",
    parameters: {
      type: "object",
      properties: {
        email:    { type: "string", description: "User's email address" },
        password: { type: "string", description: "User's password" },
      },
      required: ["email", "password"],
    },
  },
  {
    name: "register",
    description: "Register a new customer account.",
    parameters: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        last_name:  { type: "string" },
        email:      { type: "string" },
        password:   { type: "string" },
      },
      required: ["first_name", "last_name", "email", "password"],
    },
  },
  {
    name: "request_otp",
    description: "Send OTP code to user's email or phone for login or verification.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email to send OTP to" },
      },
      required: ["email"],
    },
  },
  {
    name: "verify_otp",
    description: "Verify the OTP code entered by user. Returns token on success.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string" },
        otp:   { type: "string", description: "6-digit OTP code" },
      },
      required: ["email", "otp"],
    },
  },
  {
    name: "reset_password",
    description: "Reset user password using OTP.",
    parameters: {
      type: "object",
      properties: {
        email:                 { type: "string" },
        otp:                   { type: "string" },
        password:              { type: "string" },
        password_confirmation: { type: "string" },
      },
      required: ["email", "otp", "password", "password_confirmation"],
    },
  },

  // ─── PROTECTED: Trips ─────────────────────────────────────
  {
    name: "create_trip",
    description: "Step 3 of booking. Create the actual trip using route_hash from calculate_cost.",
    parameters: {
      type: "object",
      properties: {
        route_hash:            { type: "string", description: "route_hash from calculate_cost response" },
        vehicle_type_id:       { type: "integer", description: "Selected vehicle type ID" },
        payment_method_id:     { type: "integer", description: "Selected payment method ID" },
        trip_direction:        { type: "string", enum: ["to_airport", "from_airport", "other"] },
        flight_number:         { type: "string", description: "Flight number if applicable" },
        scheduled_at:          { type: "string", description: "ISO datetime for scheduled pickup. Omit for immediate." },
        discount_code:         { type: "string" },
        gratuity_percentage:   { type: "integer", enum: [18, 20, 23, 25, 30, 35] },
        create_return_booking: { type: "boolean", description: "Whether to create a return trip too" },
        having_pet:            { type: "boolean" },
        quiet_ride:            { type: "boolean" },
        special_request:       { type: "string" },
        trip_notes:            { type: "string" },
        passenger_types: {
          type: "array",
          items: { type: "object", properties: { passenger_type_id: { type: "integer" }, quantity: { type: "integer" } } },
        },
        child_seats: {
          type: "array",
          items: { type: "object", properties: { child_seat_type_id: { type: "integer" }, quantity: { type: "integer" } } },
        },
        luggage: {
          type: "array",
          items: { type: "object", properties: { luggage_type_id: { type: "integer" }, quantity: { type: "integer" } } },
        },
      },
      required: ["route_hash", "vehicle_type_id", "payment_method_id"],
    },
  },
  {
    name: "confirm_trip",
    description: "Step 4 of booking. Confirm a created trip to finalize the booking.",
    parameters: {
      type: "object",
      properties: {
        trip_id: { type: "string", description: "Trip ID from create_trip response" },
      },
      required: ["trip_id"],
    },
  },
  {
    name: "get_trips",
    description: "Get list of all user trips. Call to show trip history or find active trip.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_trip_by_id",
    description: "Get full details of a specific trip including status and driver info.",
    parameters: {
      type: "object",
      properties: {
        trip_id: { type: "string", description: "The trip ID" },
      },
      required: ["trip_id"],
    },
  },
  {
    name: "cancel_trip",
    description: "Cancel a trip. Always call get_cancellation_policy first to warn the user about fees.",
    parameters: {
      type: "object",
      properties: {
        trip_id:             { type: "string" },
        cancellation_reason: { type: "string", description: "Reason for cancellation" },
      },
      required: ["trip_id"],
    },
  },
  {
    name: "get_cancellation_policy",
    description: "Get the cancellation fee for a trip BEFORE cancelling. Always call this first when user wants to cancel.",
    parameters: {
      type: "object",
      properties: {
        trip_id: { type: "string" },
      },
      required: ["trip_id"],
    },
  },
  {
    name: "book_return_trip",
    description: "Book a return trip from an existing trip.",
    parameters: {
      type: "object",
      properties: {
        trip_id:      { type: "string" },
        scheduled_at: { type: "string", description: "ISO datetime for return pickup" },
      },
      required: ["trip_id"],
    },
  },
  {
    name: "send_driver_message",
    description: "Send a message to the driver for an active trip.",
    parameters: {
      type: "object",
      properties: {
        trip_id: { type: "string" },
        message: { type: "string", description: "Message content to send to driver" },
      },
      required: ["trip_id", "message"],
    },
  },
  {
    name: "get_conversation",
    description: "Get the full message conversation between user and driver.",
    parameters: {
      type: "object",
      properties: {
        trip_id: { type: "string" },
      },
      required: ["trip_id"],
    },
  },
  {
    name: "submit_feedback",
    description: "Submit rating and feedback for a completed trip. Call get_feedback_questions first.",
    parameters: {
      type: "object",
      properties: {
        trip_id: { type: "string" },
        answers: {
          type: "array",
          description: "Array of question answers",
          items: {
            type: "object",
            properties: {
              question_id: { type: "integer" },
              answer:      { type: "string" },
              rating:      { type: "integer", description: "1-5 star rating" },
            },
          },
        },
        comment: { type: "string", description: "Optional additional comment" },
      },
      required: ["trip_id", "answers"],
    },
  },
  {
    name: "get_feedback_questions",
    description: "Get the feedback questions to show to user before rating. Always call before submit_feedback.",
    parameters: { type: "object", properties: {}, required: [] },
  },

  // ─── PROTECTED: Payments ──────────────────────────────────
  {
    name: "get_payment_methods",
    description: "Get list of user's saved payment methods (cards).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "add_payment_method",
    description: "Add a new payment method. Requires a tokenized payment token from the payment provider.",
    parameters: {
      type: "object",
      properties: {
        type:          { type: "string", enum: ["Card", "DigitalWallet", "BankAccount", "CashAppTransfer"] },
        token:         { type: "string", description: "Tokenized payment method from payment provider" },
      },
      required: ["type", "token"],
    },
  },
  {
    name: "delete_payment_method",
    description: "Remove a saved payment method.",
    parameters: {
      type: "object",
      properties: {
        payment_method_id: { type: "integer" },
      },
      required: ["payment_method_id"],
    },
  },
  {
    name: "set_default_payment_method",
    description: "Set a payment method as the default.",
    parameters: {
      type: "object",
      properties: {
        payment_method_id: { type: "integer" },
      },
      required: ["payment_method_id"],
    },
  },

  // ─── PROTECTED: Account & Notifications ───────────────────
  {
    name: "get_notifications",
    description: "Get list of user's notifications.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_account",
    description: "Get the logged-in user's profile information.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "logout",
    description: "Logout the current user and invalidate their session token.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

module.exports = functions;
