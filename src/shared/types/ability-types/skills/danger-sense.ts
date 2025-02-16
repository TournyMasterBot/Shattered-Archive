import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DangerSense implements IAbility {
  private static instance: DangerSense;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Danger Sense";
    this.helpFile = `
help danger sense
DANGER SENSE
Danger Sense allows you to sense what your opponent is going to do before
they do it, so you can dodge or deflect their blow.

Available to bards and bard reclasses.
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.manualDescription = "";

    if (DangerSense.instance === undefined) {
      DangerSense.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DangerSense {
    if (!DangerSense.instance) {
      DangerSense.instance = new DangerSense();
    }
    return DangerSense.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DangerSense.GetInstance() as T;
  }
}

export default DangerSense;
