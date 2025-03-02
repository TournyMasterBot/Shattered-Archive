import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ChainLightning implements IAbility {
  private static instance: ChainLightning;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Chain Lightning'
'CHAIN LIGHTNING'
'CHAIN LIGHTNING'

Syntax: cast 'chain lightning' <target>

Chain lightning is a deadly spell, producing a powerful bolt of lightning
that arcs from target to target in the room, until its force is fully
expended.  Allies of the caster may be hit by this spell if they are members
of a clan, while the caster himself will not be struck unless no other
viable target remains.  

Chain lightning is most effective when used on groups of creatures.  

See also - COMBAT 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ChainLightning.instance === undefined) {
      ChainLightning.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ChainLightning {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ChainLightning.GetInstance() as T;
  }
}

export default ChainLightning;
