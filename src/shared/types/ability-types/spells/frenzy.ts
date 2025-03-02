import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Frenzy implements IAbility {
  private static instance: Frenzy;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  abilityBuffVariable?: string | undefined;
  abilityBuffCommand?: string | undefined;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help Frenzy
FRENZY

Syntax: cast 'frenzy' <target>

The frenzy spell fills the target with righteous fury, greatly increasing
his or her attack skill and damaging capacity.  Unfortunately, this divine
wrath is coupled with a tendency to ignore threats to personal safety,
making the character easier to hit.  

Frenzy provides immunity to the calm spell (see 'help calm'), and may only
be used on those of the caster's alignment.  

See also - BENEDICTIONS 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.abilityBuffCommand = "c frenzy";

    if (Frenzy.instance === undefined) {
      Frenzy.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Frenzy {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Frenzy.GetInstance() as T;
  }
}

export default Frenzy;
