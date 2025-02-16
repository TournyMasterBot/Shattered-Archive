import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class LocateObject implements IAbility {
  private static instance: LocateObject;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Locate Object";
    this.helpFile = `
help 'Locate Object'
'LOCATE OBJECT'
'LOCATE OBJECT'

Syntax: cast 'locate object' <name>
This spell reveals the location of all objects with the given name.
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (LocateObject.instance === undefined) {
      LocateObject.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): LocateObject {
    if (!LocateObject.instance) {
      LocateObject.instance = new LocateObject();
    }
    return LocateObject.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return LocateObject.GetInstance() as T;
  }
}

export default LocateObject;
