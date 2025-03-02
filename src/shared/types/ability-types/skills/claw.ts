import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Claw implements IAbility {
  private static instance: Claw;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = ""; // Empty help file as specified

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;

    if (Claw.instance === undefined) {
      Claw.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Claw {
    if (!Claw.instance) {
      Claw.instance = new Claw();
    }
    return Claw.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Claw.GetInstance() as T;
  }
}

export default Claw;
