import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateRose implements IAbility {
  private static instance: CreateRose;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Create Rose'
'CREATE ROSE'
'CREATE ROSE'

Syntax: cast 'create rose'

A romantic spell that creates a fragrant red rose, with utterly no game use
whatsoever.  

See also - CREATION 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CreateRose.instance === undefined) {
      CreateRose.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CreateRose {
    if (!CreateRose.instance) {
      CreateRose.instance = new CreateRose();
    }
    return CreateRose.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CreateRose.GetInstance() as T;
  }
}

export default CreateRose;
