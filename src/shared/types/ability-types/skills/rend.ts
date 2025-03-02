import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Rend implements IAbility {
  private static instance: Rend;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
rend
A passive Nightshade skill that is checked after each successful backstab. 
If the rend check is successful the nightshade twists the weapon and opens a
large wound that bleeds for additional damage over the next three rounds
with decreased damage each round.  

Since it is a passive skill, typing it does no good.  Simply backstab for
rend to have a chance to work.  
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;

    if (Rend.instance === undefined) {
      Rend.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Rend {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Rend.GetInstance() as T;
  }
}

export default Rend;
