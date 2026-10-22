(steps)=
## Steps

:::{hints}
slides: { class: fx-steps }
:::

Here a component follows the steps: its state is a function of the step.

:::{slide}
**Steps**: jumping to a step looks the same as stepping there
:::

:::{component} DemoStepper
:span: 3
steps: [Parse, Start, Render]
:::

The stepper has three labels and takes three steps.

The first step highlights Parse.

The second step highlights Start.

The third step highlights Render.

:::{only} web
A note for the web form only.
:::

(late-steps)=
## Steps of a later block

:::{hints}
slides: { class: fx-late-steps }
:::

:::{slide}
:reveal:
**First**: a sentence
:::

:::{slide}
:reveal:
**Second**: the stepper comes next and counts its steps from here
:::

:::{component} DemoStepper
:span: 3
steps: [Parse, Start, Render]
:::

(services)=
## Services and motion

:::{hints}
slides: { class: fx-services }
:::

:::{component} DemoGreeting
:::

:::{component} DemoAnimated
:::
