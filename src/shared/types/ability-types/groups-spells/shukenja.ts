import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SpiritOfRetribution from "@shared/types/ability-types/spells/spirit-of-retribution";
import SpiritOfProtection from "@shared/types/ability-types/spells/spirit-of-protection";
import BlessingOfPeace from "@shared/types/ability-types/spells/blessing-of-peace";
import SummonYanLuo from "@shared/types/ability-types/spells/summon-yan-luo";
import AncestralHonor from "@shared/types/ability-types/spells/ancestral-honor";
import ServerCache from "@shared/cache/server-cache";

export class Shukenja implements IAbilityGroup {
  static instance: Shukenja;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Shukenja;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      SpiritOfRetribution.GetInstance(),
      SpiritOfProtection.GetInstance(),
      BlessingOfPeace.GetInstance(),
      SummonYanLuo.GetInstance(),
      AncestralHonor.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Shukenja {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Shukenja.GetInstance() as T;
  }
}

export default Shukenja;
