import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import SpiritOfRetribution from "@shared/types/ability-types/spells/spirit-of-retribution";
import SpiritOfProtection from "@shared/types/ability-types/spells/spirit-of-protection";
import BlessingOfPeace from "@shared/types/ability-types/spells/blessing-of-peace";
import SummonYanLuo from "@shared/types/ability-types/spells/summon-yan-luo";
import AncestralHonor from "@shared/types/ability-types/spells/ancestral-honor";

export class Shukenja implements IAbilityGroup {
  static instance: Shukenja;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.Shukenja;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      SpiritOfRetribution.GetInstance().Get(),
      SpiritOfProtection.GetInstance().Get(),
      BlessingOfPeace.GetInstance().Get(),
      SummonYanLuo.GetInstance().Get(),
      AncestralHonor.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Shukenja {
    if (!Shukenja.instance) {
      Shukenja.instance = new Shukenja();
    }
    return Shukenja.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Shukenja.GetInstance() as T;
  }
}

export default Shukenja;
