import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CreateRangerStaff implements IAbility {
  private static instance: CreateRangerStaff;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Create Ranger Staff'
'CREATE RANGER STAFF'
'CREATE RANGER STAFF'

Syntax: cast 'create ranger staff'

While rangers tend to favor the staff over other possible weapons, the best
of all staves for a ranger to use is one of his or her own making. With
nature skills and the use of this spell, powerful weapons may be made.  

The value of weapons produced by rangers does, of course, vary with the
level and skill of the ranger who creates it.  

See also - NATURE RANGER 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CreateRangerStaff.instance === undefined) {
      CreateRangerStaff.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CreateRangerStaff {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CreateRangerStaff.GetInstance() as T;
  }
}

export default CreateRangerStaff;
