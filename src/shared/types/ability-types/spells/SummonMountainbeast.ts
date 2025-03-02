import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SummonMountainbeast implements IAbility {
  private static instance: SummonMountainbeast;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `SUMMON MOUNTAINBEAST

Syntax:  cast 'summon mountainbeast'
 
Drawing upon the teachings of Zandreya, the Eldritch is able to summon 
forth a great mountainous beast, harnessing its ability to attack so it 
will fight by the caster's side. The effects of the summonable creature 
are random, sometimes appearing with claws for slashing, fangs for 
piercing or even fists for pounding.  

Groups containing this spell: ELDRITCH`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SummonMountainbeast.instance === undefined) {
      SummonMountainbeast.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SummonMountainbeast {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SummonMountainbeast.GetInstance() as T;
  }
}

export default SummonMountainbeast;
