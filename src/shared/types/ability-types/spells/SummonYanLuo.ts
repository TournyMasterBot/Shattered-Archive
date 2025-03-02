import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonYanLuo implements IAbility {
  private static instance: SummonYanLuo;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SUMMON YAN LUO

Syntax: cast 'summon yan luo'

Harnessing their command of the spirit world, the shukenja can summon a
creature known as the Yan Luo. The deadly spirit enjoys torturing its
victims before killing them and fears not the strike of any magical weapon
or spell.

Groups containing this skill: SHUKENJA`;
    this.manualDescription = `Yan Luo (Shukenja Summon)
Yan Luo appears to be a more neutral soul.
Their wealth appears to be 0 gold and 0 silver.
They appear to be male.
The base health of this creature is 2771.
The base magically ability of this creature is 124.
This creature is upon the cycle of training '44'.
This creature does 5d11 damage in a wrath manner.
The creature has the following characteristics:
Offensive Tactics: bash berserk parry rescue
Immunities: charm fire cold lightning poison negative mental disease drowning
Resistances: blunt fire mental
Vulnerabilities: holy drowning
This creature is affected by detect_invis detect_hidden infrared charm flying pass_door dark vision`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonYanLuo.instance === undefined) {
      SummonYanLuo.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonYanLuo {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonYanLuo.GetInstance() as T;
  }
}

export default SummonYanLuo;
