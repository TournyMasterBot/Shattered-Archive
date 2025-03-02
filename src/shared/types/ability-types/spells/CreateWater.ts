import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateWater implements IAbility {
  private static instance: CreateWater;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Create Water'
'CREATE WATER'
'CREATE WATER'

Syntax: cast 'create water' <drink-container>

This spell replenishes a drink container with water.  

See also - CREATION 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CreateWater.instance === undefined) {
      CreateWater.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CreateWater {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CreateWater.GetInstance() as T;
  }
}

export default CreateWater;
