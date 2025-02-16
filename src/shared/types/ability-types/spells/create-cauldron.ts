import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateCauldron implements IAbility {
  private static instance: CreateCauldron;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Create Cauldron";
    this.helpFile = `
CREATE CAULDRON
CREATE CAULDRON

Syntax: cast 'create cauldron'

The primary component for all potion brewing by warlock or witch is the
great cauldron to brew the potion in. The 'create cauldron' spell calls a
huge iron cauldron into being from which gourds can be created.

See also - WITCHCRAFT
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CreateCauldron.instance === undefined) {
      CreateCauldron.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CreateCauldron {
    if (!CreateCauldron.instance) {
      CreateCauldron.instance = new CreateCauldron();
    }
    return CreateCauldron.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CreateCauldron.GetInstance() as T;
  }
}

export default CreateCauldron;
