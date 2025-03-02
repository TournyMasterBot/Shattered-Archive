import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Nondetection implements IAbility {
  private static instance: Nondetection;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
NONDETECTION

Syntax: cast 'nondetection'

This spell works in conjunction with the spell of invisibility to mask the
presence of the Invoker so much that normal spells of detection are useless
against the invocation.
        `;
    this.abilityGroupType = AbilityGroupType.Unknown; // Set appropriate group type
    this.abilityUsage = AbilityUsage.Active;

    if (Nondetection.instance === undefined) {
      Nondetection.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Nondetection {
    if (!Nondetection.instance) {
      Nondetection.instance = new Nondetection();
    }
    return Nondetection.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Nondetection.GetInstance() as T;
  }
}

export default Nondetection;
