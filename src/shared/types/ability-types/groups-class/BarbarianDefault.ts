import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ShieldBlock from "@shared/types/ability-types/skills/ShieldBlock";
import Disarm from "@shared/types/ability-types/skills/Disarm";
import ThirdAttack from "@shared/types/ability-types/skills/ThirdAttack";
import PowerSwing from "@shared/types/ability-types/skills/PowerSwing";
import PrayRecall from "@shared/types/ability-types/skills/PrayRecall";
import Offering from "@shared/types/ability-types/skills/Offering";
import EnhancedDamage from "@shared/types/ability-types/skills/EnhancedDamage";
import FourthAttack from "@shared/types/ability-types/skills/FourthAttack";
import ShieldKick from "@shared/types/ability-types/skills/ShieldKick";
import Mudcoat from "@shared/types/ability-types/skills/Mudcoat";
import MakeJewelry from "@shared/types/ability-types/skills/MakeJewelry";
import Bash from "@shared/types/ability-types/skills/Bash";
import Parry from "@shared/types/ability-types/skills/Parry";
import Warcry from "@shared/types/ability-types/skills/Warcry";
import Cleanse from "@shared/types/ability-types/skills/Cleanse";
import SecondWind from "@shared/types/ability-types/skills/SecondWind";
import Butcher from "@shared/types/ability-types/skills/Butcher";
import Weaponsmaster from "../groups-skills/Weaponsmaster";
import ServerCache from "@shared/cache/server-cache";

export class BarbarianDefault implements IAbilityGroup {
  static instance: BarbarianDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
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
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BarbarianDefault.GetInstance() as T;
  }
}

export default BarbarianDefault;
