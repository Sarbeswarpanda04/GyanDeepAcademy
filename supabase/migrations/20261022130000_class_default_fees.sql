alter table public.institute_classes
  add column default_fee_amount numeric(10, 2),
  add column default_fee_frequency text not null default 'monthly',
  add constraint institute_classes_default_fee_amount_nonnegative
    check (default_fee_amount is null or default_fee_amount >= 0),
  add constraint institute_classes_default_fee_frequency_valid
    check (
      default_fee_frequency in (
        'monthly',
        'quarterly',
        'half_yearly',
        'yearly',
        'one_time'
      )
    );
