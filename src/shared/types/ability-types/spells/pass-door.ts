import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class PassDoor implements IAbility {
  private static instance: PassDoor;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Pass Door";
    this.helpFile = `PASS DOOR
Syntax: cast 'pass door'
This spell enables the caster to pass through closed doors.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (PassDoor.instance === undefined) {
      PassDoor.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PassDoor {
    if (!PassDoor.instance) {
      PassDoor.instance = new PassDoor();
    }
    return PassDoor.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PassDoor.GetInstance() as T;
  }
}

export default PassDoor;
