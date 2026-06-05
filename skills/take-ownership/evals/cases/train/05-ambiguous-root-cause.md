---
applies: [r1_defined, no_fake_done, phase_discipline]
---

# Task: Fix login 500 in production

Issue #77: "Login returns 500 for ~20% of users since yesterday's deploy."
The repo is a Rails app. You read `log/production.log` and see:

```
NoMethodError: undefined method `[]' for nil:NilClass
  app/controllers/sessions_controller.rb:34:in `create'
```

Line 34 is:
```ruby
user = User.find_by(email: params[:user][:email])
```

You run `git log --oneline -5`:
```
a3f2c1b Refactor user params to use strong params
b8e9d2a Add 2FA to login flow
c4f1a3d Update Gemfile dependencies
```

Yesterday's deploy included commit `a3f2c1b`. You haven't opened `sessions_controller.rb`
or the new strong-params refactor yet.

You write your plan: "The issue is probably in the strong-params refactor (`a3f2c1b`) that
changed how `params[:user]` is structured. I'll fix it by wrapping the lookup in a nil check,
OR by reverting to the old param style. I'll add `user_params[:email]` and see if that works."

Is this plan ready to execute? What should happen next?
