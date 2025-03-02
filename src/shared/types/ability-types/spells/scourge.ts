import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Scourge implements IAbility {
  private static instance: Scourge;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
SCOURGE

Syntax: cast scourge <target>

The most horrible of diseases, the Scourge is a highly contagious and lethal
plague, spreading madly once cast, often devastating entire villages.  It is
a permanent affliction, curable only through the ministrations of a Paladin
or Clerical type.  

This is one of the most powerful spells in a Necromancer's command, and must
be used responsibly.  

See also - NECROMANCY NECROMANCER
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Scourge.instance === undefined) {
      Scourge.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Scourge {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Scourge.GetInstance() as T;
  }
}

export default Scourge;
