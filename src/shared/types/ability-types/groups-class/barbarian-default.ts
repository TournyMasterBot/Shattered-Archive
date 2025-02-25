import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ShieldBlock from "@shared/types/ability-types/skills/shield-block";
import Disarm from "@shared/types/ability-types/skills/disarm";
import ThirdAttack from "@shared/types/ability-types/skills/third-attack";
import PowerSwing from "@shared/types/ability-types/skills/power-swing";
import PrayRecall from "@shared/types/ability-types/skills/pray-recall";
import Offering from "@shared/types/ability-types/skills/offering";
import EnhancedDamage from "@shared/types/ability-types/skills/enhanced-damage";
import FourthAttack from "@shared/types/ability-types/skills/fourth-attack";
import ShieldKick from "@shared/types/ability-types/skills/shield-kick";
import Mudcoat from "@shared/types/ability-types/skills/mudcoat";
import MakeJewelry from "@shared/types/ability-types/skills/make-jewelry";
import Bash from "@shared/types/ability-types/skills/bash";
import Parry from "@shared/types/ability-types/skills/parry";
import Warcry from "@shared/types/ability-types/skills/warcry";
import Cleanse from "@shared/types/ability-types/skills/cleanse";
import SecondWind from "@shared/types/ability-types/skills/second-wind";
import Butcher from "@shared/types/ability-types/skills/butcher";
import Weaponsmaster from "../groups-skills/weaponsmaster";

export class BarbarianDefault implements IAbilityGroup {
  static instance: BarbarianDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.BarbarianDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Weaponsmaster.GetInstance().Get<Weaponsmaster>().abilities,
      ShieldBlock.GetInstance(),
      Disarm.GetInstance(),
      ThirdAttack.GetInstance(),
      PowerSwing.GetInstance(),
      PrayRecall.GetInstance(),
      Offering.GetInstance(),
      EnhancedDamage.GetInstance(),
      FourthAttack.GetInstance(),
      ShieldKick.GetInstance(),
      Mudcoat.GetInstance(),
      MakeJewelry.GetInstance(),
      Bash.GetInstance(),
      Parry.GetInstance(),
      Warcry.GetInstance(),
      Cleanse.GetInstance(),
      SecondWind.GetInstance(),
      Butcher.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BarbarianDefault {
    if (!BarbarianDefault.instance) {
      BarbarianDefault.instance = new BarbarianDefault();
    }
    return BarbarianDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BarbarianDefault.GetInstance() as T;
  }
}

export default BarbarianDefault;
